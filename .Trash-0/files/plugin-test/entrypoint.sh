#!/bin/bash
# Redmine Reader test environment boot orchestrator.
#
# First boot (plugin directory missing):
#   1. core db:migrate
#   2. start bare Redmine (plugin not loaded -> no migration-dependent errors)
#   3. once the bare server is ready: git clone the plugin repository
#   4. bundle exec rake redmine:plugins:migrate
#   5. restart Redmine with the plugin loaded
#
# Subsequent boots (plugin already cloned):
#   1. core db:migrate
#   2. plugin migrations (idempotent)
#   3. start Redmine
#
# Both paths also sync plugin assets and (idempotently) load zh default data
# before the final server start.

set -e

PLUGIN_NAME=redmine_reader
PLUGIN_URL=https://cnb.cool/xindu.site/redmine_reader.git
PLUGIN_DIR=/usr/src/redmine/plugins/${PLUGIN_NAME}

wait_for_server() {
  echo "    waiting for bare Redmine to become ready ..."
  ruby -rnet/http -e '
    uri = URI("http://127.0.0.1:3000/login")
    30.times do
      begin
        code = Net::HTTP.get_response(uri).code.to_i
        exit 0 if [200, 301, 302].include?(code)
      rescue StandardError
      end
      sleep 2
    end
    STDERR.puts "    bare Redmine did not become ready in time"
    exit 1
  '
}

echo "==> [1/5] Core database migration"
bundle exec rake db:migrate

if [ ! -d "${PLUGIN_DIR}" ]; then
  echo "==> [2/5] First boot: start bare Redmine (plugin not cloned yet)"
  bundle exec rails server -b 0.0.0.0 -p 3000 &
  SERVER_PID=$!
  wait_for_server

  echo "==> [3/5] Clone plugin repository"
  git clone "${PLUGIN_URL}" "${PLUGIN_DIR}"

  echo "==> [4/5] Plugin migrations"
  bundle exec rake redmine:plugins:migrate

  echo "==> [5/5] Restart Redmine with plugin"
  kill "${SERVER_PID}"
  wait "${SERVER_PID}" 2>/dev/null || true
else
  echo "==> [2/5] Plugin already present (skip clone)"
  echo "==> [3/5] Plugin migrations (idempotent)"
  bundle exec rake redmine:plugins:migrate
fi

echo "==> Sync plugin assets (manual copy; rake task is missing in this image)"
mkdir -p /usr/src/redmine/public/plugin_assets/${PLUGIN_NAME}
cp -r /usr/src/redmine/plugins/${PLUGIN_NAME}/assets/. \
      /usr/src/redmine/public/plugin_assets/${PLUGIN_NAME}/

echo "==> Default data (zh, idempotent)"
REDMINE_LANG=zh bundle exec rake redmine:load_default_data || echo "    default data already loaded, skip"

echo "==> Starting Rails server on :3000 (with plugin)"
exec bundle exec rails server -b 0.0.0.0 -p 3000
