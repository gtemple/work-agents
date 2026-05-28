# Remote access via Tailscale

The server (MacBook Air) already has Tailscale running. These are the steps for any new machine you want to access it from.

---

## 1. Install Tailscale on the new laptop

- **Mac**: `brew install --cask tailscale` or download from [tailscale.com/download](https://tailscale.com/download)
- **Windows**: download the installer from [tailscale.com/download](https://tailscale.com/download)
- **Linux**: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`

## 2. Sign in with the same account

Log in with the same account the server is registered under. Once authenticated, the server will appear automatically — no further config needed.

## 3. Find the server's Tailscale IP or hostname

The MacBook Air is already registered:

- **Tailscale IP**: `100.110.17.46`
- **MagicDNS hostname**: `giordanos-macbook-air`

(Verify at [login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines) if anything changes.)

## 4. Access the app

```
http://100.110.17.46:8000
```

Same port as the local network (`192.168.2.18:8000`). Tailscale routes it through the tunnel automatically — no VPN config, no port forwarding needed.

---

## Making changes from the new laptop

Pull the repo, make changes, push — then deploy to the server over SSH via Tailscale:

```bash
# Pull latest
git pull

# SSH into the server (use Tailscale IP or MagicDNS hostname)
ssh giordanotemple@<tailscale-ip>

# Or add this to ~/.ssh/config for convenience:
# Host mac
#   HostName 100.110.17.46
#   User giordanotemple
```

Deploy commands (same as usual, just using the Tailscale address instead of `192.168.2.18`):

```bash
ssh mac 'cd work-agents && git pull'
ssh mac 'cd work-agents/backend && source .venv/bin/activate && python3 manage.py migrate'
ssh mac 'export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin" && cd work-agents/frontend && npm run build'
ssh mac 'launchctl unload ~/Library/LaunchAgents/local.work-agents.backend.plist && launchctl load ~/Library/LaunchAgents/local.work-agents.backend.plist'
```
