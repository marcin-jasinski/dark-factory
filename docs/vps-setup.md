# Run the dark factory on a VPS

This guide sets up a Linux VPS that runs dark-factory runs 24/7. You control the runs from
the Claude app on your phone. The example project is MindForge (Java 21, Maven, Angular,
Testcontainers). For a different project, change the build tools in step 4 and the
commands in `.claude/factory.md`.

How it works:

```
phone (Claude app) ──► Anthropic (models, Remote Control relay) ◄── VPS: tmux → claude remote-control
                                                                      │  in ~/projects/mindforge
                                                                      ├─ git / gh → GitHub
                                                                      └─ mvn verify → Docker (Testcontainers)
```

The models run at Anthropic. The VPS only runs Claude Code, git and your build and tests.
Remote Control uses outbound connections only, so you do not open any inbound port except SSH.

Time to complete: about 1 hour.

---

## 1. Buy the VPS

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 4 vCPU | 4–8 dedicated or "regular" vCPU (not "burstable" or shared-credit plans) |
| RAM | 8 GB + 4 GB swap | 16 GB |
| Disk | 40 GB SSD | 80 GB NVMe |
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| Network | **public IPv4** | public IPv4 |

- Get a public IPv4 address. GitHub has no IPv6 support, so an IPv6-only server cannot clone or push.
- x86_64 is the safe choice. ARM64 is cheaper and Java, Node, Postgres and Claude Code support it,
  but do one full gate run (step 6.4) before you use it for real runs.
- Measured for MindForge on 4 vCPU / 16 GB: the full gate (`mvn verify`, 306 tests) takes about 60 s,
  and the caches and Docker images use about 2 GB.
- One factory run uses one checkout and runs tickets one at a time. For each additional project
  that runs at the same time, add about 2 vCPU and 4 GB RAM.

When you order the server, add your SSH public key. If you do not have a key, make one on your
computer:

```bash
ssh-keygen -t ed25519 -C "vps"
cat ~/.ssh/id_ed25519.pub        # paste this into the provider's "SSH key" field
```

---

## 2. Secure the server

Do these steps as `root`.

### 2.1 Log in and update

```bash
ssh root@<server-ip>
apt update && apt full-upgrade -y
apt install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades   # automatic security updates
timedatectl set-timezone Europe/Warsaw                   # your time zone; used in journal times
```

### 2.2 Make a work user

Do not run Claude Code as `root`. `bypassPermissions` mode is not available to `root`.

```bash
adduser factory                       # set a strong password; you need it for sudo
usermod -aG sudo factory
mkdir -p /home/factory/.ssh
cp /root/.ssh/authorized_keys /home/factory/.ssh/
chown -R factory:factory /home/factory/.ssh
chmod 700 /home/factory/.ssh && chmod 600 /home/factory/.ssh/authorized_keys
```

Open a **second** terminal and make sure that `ssh factory@<server-ip>` works before you continue.

### 2.3 Turn off password and root login for SSH

```bash
cat > /etc/ssh/sshd_config.d/10-hardening.conf << 'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
systemctl restart ssh
```

### 2.4 Firewall

```bash
ufw allow OpenSSH
ufw enable
ufw status          # only OpenSSH must be allowed
```

Note: Docker writes its own iptables rules, so a port that a container publishes is open even
with `ufw`. Testcontainers publishes ports only on random high ports for a short time. Do not
publish ports from your own `docker run` or `docker compose` commands on this server, or bind
them to `127.0.0.1` (for example `-p 127.0.0.1:5432:5432`).

### 2.5 Swap (necessary with 8 GB RAM, recommended with 16 GB)

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

From this point, log in as `factory`: `ssh factory@<server-ip>`.

---

## 3. Install the base tools

```bash
sudo apt install -y git curl ca-certificates gnupg tmux unzip jq ripgrep build-essential
```

---

## 4. Install the project's build tools

These are the tools that MindForge's gate needs (`.claude/factory.md` → `commands`).

### 4.1 Docker Engine (Testcontainers needs it)

Use Docker's own repository. Ubuntu's `docker.io` package is older.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker factory
```

Log out and log in again (the group change starts with a new login). Then check:

```bash
docker run --rm hello-world
```

Docker starts automatically at boot. Make the Docker logs smaller, so that they do not fill the disk:

```bash
echo '{ "log-driver": "local", "log-opts": { "max-size": "10m" } }' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

### 4.2 Java 21 and Maven

```bash
sudo apt install -y openjdk-21-jdk-headless maven
java -version        # must show 21
mvn -version         # must use Java 21
```

### 4.3 Node.js 22 (frontend build and frontend gate)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v              # v22.x
```

---

## 5. GitHub access

The factory pushes the phase branch, merges into `develop` and mirrors tickets to GitHub Issues
(`gh`). Give the server a token that can do only that.

### 5.1 Make a fine-grained token

On github.com: **Settings → Developer settings → Personal access tokens → Fine-grained tokens →
Generate new token**.

- **Repository access:** only the repositories the factory works on (for example `mindforge`).
- **Permissions:**
  - Contents: Read and write
  - Issues: Read and write
  - Pull requests: Read and write
  - Metadata: Read (set automatically)
- **Expiration:** set a date, and write it in your calendar. When the token expires, pushes fail.

### 5.2 Install `gh` and log in

```bash
sudo mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] \
https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install -y gh

gh auth login --with-token       # paste the token, then press Enter and Ctrl+D
gh auth setup-git                # git uses the same token for https:// remotes
gh auth status
```

### 5.3 Git identity

The factory's commits use this name. Use a name that shows that a machine made them:

```bash
git config --global user.name  "Dark Factory (VPS)"
git config --global user.email "<your-github-noreply-email>"
git config --global pull.ff only
```

Your GitHub noreply address is on github.com → Settings → Emails.

---

## 6. Clone and prepare the project

### 6.1 Clone

```bash
mkdir -p ~/projects && cd ~/projects
git clone https://github.com/<owner>/mindforge.git
cd mindforge
git switch develop                # the integration branch in .claude/factory.md
```

### 6.2 Check the factory config

MindForge already has the two files that the factory needs:

- `.claude/settings.json` loads the dark-factory plugin from GitHub
  (`extraKnownMarketplaces` + `enabledPlugins`). Claude Code installs it when it first opens the folder.
- `.claude/factory.md` has the commands, the branches and the limits. Check that it has
  `git.push: true` and `git.park_mode: branch`.

For a new project, run `/dark-factory:init` in step 7.3. It writes `.claude/factory.md`.

The `.claude/hooks/session-start.sh` hook is for cloud sessions only. On the VPS it does nothing,
because the steps below do its work one time, and the VPS keeps the result.

### 6.3 Build the frontend one time

`mvn verify -DskipFrontend=true` copies `frontend/dist` into the JAR, and an integration test
needs the single-page app there. The frontend gate also needs `node_modules`.

```bash
cd ~/projects/mindforge/frontend
npm ci
npm run build
cd ..
```

### 6.4 Run the full gate one time

This downloads all Maven dependencies and test components, so that the offline fast check
(`mvn -o test`) works after it. It also downloads the Postgres image.

```bash
mvn -B verify -DskipFrontend=true
mvn -q -o test -DskipFrontend=true -Djacoco.skip=true && echo "fast check OK"
```

Both must pass. If the gate fails here, fix it before you start a run: the factory records
these failures as "baseline failures" and does not fix them.

---

## 7. Install Claude Code and log in

### 7.1 Install

```bash
curl -fsSL https://claude.ai/install.sh | bash
exec $SHELL -l                    # loads the new PATH
claude --version
claude doctor
```

The native installer updates Claude Code automatically.

### 7.2 Log in with your claude.ai subscription

Remote Control needs a **claude.ai subscription login** (Pro, Max, Team or Enterprise; on
Team and Enterprise an Owner must turn on Remote Control). It does **not** work with
`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or a `claude setup-token` token. Make sure that
none of these variables is set (`env | grep -i anthropic` shows nothing).

```bash
cd ~/projects/mindforge
claude
```

The server has no browser:
1. When Claude Code shows the login, press `c` to copy the login URL (or copy it from the screen).
2. Open the URL in the browser on your phone or computer, and log in.
3. If the browser shows a code, paste it at the `Paste code here if prompted` prompt.

### 7.3 First session in the project folder

In the same `claude` session:

1. Answer **Yes** to "trust this folder". If the folder is not trusted and no terminal can ask, `claude remote-control` exits with `Workspace not trusted`.
2. Install the plugin when Claude Code asks you. Then type `/plugin` and check that
   `dark-factory` is installed and enabled. Type `/` and check that the `/dark-factory:*` commands are in the list.
3. For a new project only: `/dark-factory:init`, then commit `.claude/factory.md` and `.gitignore`.
4. Type `/config` and turn on the push notification **"Push when actions required"**. The app then
   tells you about permission prompts and questions.
5. Exit with `/exit`.

### 7.4 Accept bypass mode one time

The VPS is a dedicated machine that does only this work. Thus the plugin README allows
`bypassPermissions` here: a run must not stop on a permission prompt. The `branch-guard`
hook still blocks protected branches, force pushes and history rewrites.

```bash
claude --permission-mode bypassPermissions
```

If Claude Code asks you to confirm the mode, confirm it. Then `/exit`.

If you prefer to keep permission prompts: use `acceptEdits` in step 8 and add an allowlist
for `mvn`, `npm`, `git`, `gh` and `node` in `.claude/settings.local.json`. A run then stops when it
needs a command that is not in the list, and you approve it from the phone.

---

## 8. Start Remote Control in tmux

`claude remote-control` is the server. It must keep running: when it stops, the sessions go
offline. `tmux` keeps it running after you disconnect SSH.

```bash
tmux new -s factory
cd ~/projects/mindforge
claude remote-control --name "mindforge-vps" --permission-mode bypassPermissions
```

- On the first start, answer `y` to "Enable Remote Control?".
- Press the spacebar to show a QR code. Scan it with the phone to open the session.
- Detach from tmux with `Ctrl+B`, then `D`. The server continues to run.
  To come back: `tmux attach -t factory`.

One project per server process. For a second project, open a new tmux window
(`Ctrl+B`, then `C`), `cd` into the other project, and start a second `claude remote-control`
with a different `--name`. Do not run two factory runs in the same checkout: they share one
working tree.

In the Claude app on the phone: tap **Code**. Sessions from the VPS show a computer icon with a
green dot.

---

## 9. Daily use from the phone

| Task | What to do in the session on the phone |
|---|---|
| Start a run | `/dark-factory:run "Phase 14"` (empty = next unfinished unit) |
| See progress | `/dark-factory:status` |
| Answer a blocker | `/dark-factory:resume <your answer>` |
| Continue after a halt or a crash | `/dark-factory:resume` |
| Stop a run cleanly | `/dark-factory:halt <reason>` |
| Check the result | the run's `REPORT.md` and the tracking issue on GitHub |

After the start, the run does not ask you anything. It stops only for a blocker or a halt.
The push notification (step 7.3) then tells you. Every commit on the phase branch is pushed
(a checkpoint), so you can also see the progress on GitHub.

---

## 10. Maintenance

### When the Remote Control server stops

If the network is down for more than about 10 minutes, the server exits. Sessions can be
resumed for about 4 hours after that:

```bash
tmux attach -t factory
claude remote-control --name "mindforge-vps" --permission-mode bypassPermissions --continue
```

Then type `/dark-factory:resume` in the session.

After a reboot of the VPS, start tmux and the server again (step 8). The run state is on disk
and on the remote phase branch, so `/dark-factory:resume` continues the run.

### Login expiry

A session that runs longer than the login stops when the login expires. Claude Code shows a
warning 3 days before. Then attach to tmux, open a `claude` session and type `/login`.

### Disk space

Check one time each month:

```bash
df -h /
docker system df
docker image prune -af --filter "until=720h"     # images not used for 30 days
docker builder prune -af
```

The factory keeps parked tickets on `factory/parked/*` branches. Delete them on GitHub when you
do not need them.

### Updates

- Ubuntu security updates install automatically (step 2.1). Reboot when
  `/var/run/reboot-required` exists, but not during a run (`/dark-factory:status`).
- Claude Code updates itself.
- The plugin: in a `claude` session, `/plugin` → update `dark-factory`.

---

## 11. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Preflight fails: Docker is not running | `sudo systemctl start docker`; check `docker run --rm hello-world` as `factory` |
| `permission denied ... docker.sock` | The user is not in the `docker` group: step 4.1, then log in again |
| Fast check fails: "Cannot access central in offline mode" | Run the full gate online one time (step 6.4) |
| `ApiFlowTest.theLoginRouteIsTheSinglePageApp` fails with 404 | No frontend build: step 6.3 |
| `git push` fails with 403 | The token expired or has no write access: step 5.1, then `gh auth login --with-token` |
| `claude remote-control` exits with `Workspace not trusted` | Open `claude` in the folder one time and trust it (step 7.3) |
| "Remote Control requires a claude.ai subscription auth" | An API key or token is set: remove `ANTHROPIC_API_KEY` from the environment, then `claude auth login` |
| The session is not in the app | The server stopped: `tmux attach -t factory` and start it again (step 10) |
| Out of memory during the gate | Add swap (step 2.5) or use a server with 16 GB |

---

## Checklist

- [ ] VPS with public IPv4, 4 vCPU, 8–16 GB RAM, Ubuntu 24.04
- [ ] User `factory`, SSH key login only, `ufw` on, automatic security updates
- [ ] Docker, Java 21, Maven, Node 22, `gh` installed; `docker run hello-world` works as `factory`
- [ ] Fine-grained GitHub token; `gh auth status` OK; git identity set
- [ ] Project cloned on `develop`; frontend built; full gate and fast check pass
- [ ] Claude Code logged in with the subscription; folder trusted; plugin enabled; push notifications on
- [ ] `claude remote-control` runs in tmux; the session shows in the app on the phone
- [ ] `/dark-factory:status` works from the phone
