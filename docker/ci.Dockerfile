# Job image for the self-hosted GitLab runner (.gitlab-ci.yml). Each job starts its own Docker daemon in here
# (privileged runner), so CI never touches the developer's containers on the same machine.
# shortcut: built on the runner's host by hand, not by the pipeline; rebuild after changing Node, pnpm or Playwright:
#   docker build -t greenscape-ci:1 -f docker/ci.Dockerfile docker
FROM node:24-bookworm

# Docker Engine, Compose and Buildx from Docker's apt repository.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg iptables jq \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
 && apt-get update && apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

# Moves the job into a child cgroup so a nested dockerd works on cgroup v2 hosts.
COPY --from=docker:28-dind /usr/local/bin/dind /usr/local/bin/dind

# Same pnpm as package.json "packageManager"; Chromium for the e2e and smoke tests (version = pnpm-lock.yaml).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate \
 && npx -y playwright@1.65.0 install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm
