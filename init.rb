# frozen_string_literal: true

# Redmine Reader plugin — online document reader for Redmine 6.1.x
#
# Enables in-browser preview of attachments (docx / pdf / markdown /
# text / pptx / excel) no matter where they are attached: project Files,
# issues, documents, wiki, news, forums, help pages ...
#
# Architecture: one reader page (controller + view) + one global view hook.
# All document parsing happens client-side; no extra gems, no migrations.

require_relative 'lib/redmine_reader/hooks'

Redmine::Plugin.register :redmine_reader do
  name 'Redmine Reader plugin'
  description 'Online document reader: preview docx/pdf/markdown/text/pptx/excel attachments anywhere'
  version '1.0.0'
  author 'xindu.site'
  url 'https://cnb.cool/xindu.site/redmine_reader'
  requires_redmine version_or_higher: '6.1'
end
