# Redmine Reader plugin image.
#
# Based on the official redmine:7.0.1 image. The plugin repository is NOT
# cloned at build time: on first boot the plugin directory does not exist, so
# Redmine starts without the plugin against the freshly migrated database.
# The entrypoint script then, once the bare server is ready, clones the plugin
# repo, runs the plugin migration and restarts the server with the plugin.
#
# Build:   docker compose build
# Run:     docker compose up -d --build   then open http://localhost:8080
#          (admin / admin — first login forces a password change)

FROM redmine:7.0.1

# Install the boot orchestrator. The plugin itself is cloned at runtime by
# this script (see entrypoint.sh), after the bare Redmine server is up.
COPY entrypoint.sh /usr/local/bin/redmine-entrypoint.sh
RUN chmod +x /usr/local/bin/redmine-entrypoint.sh
