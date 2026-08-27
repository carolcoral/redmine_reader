# frozen_string_literal: true

module RedmineReader
  # Global view hooks for the reader plugin.
  #
  # Injects a tiny entry script into every page layout. The script scans
  # the DOM for attachment download links (/attachments/download/:id/:name)
  # whose extension is supported and rewrites their href so that clicking
  # opens the reader page. The original download URL is preserved in a
  # data attribute and remains reachable via the reader toolbar download
  # button, so the native download capability stays intact.
  class Hooks < Redmine::Hook::ViewListener
    render_on :view_layouts_base_html_head, partial: 'hooks/redmine_reader/head'
  end
end
