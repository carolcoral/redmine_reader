# frozen_string_literal: true

# Renders the reader page for a single attachment.
#
# The reader page is a standalone full-screen HTML document (no Redmine
# base layout) that loads its own assets and renders the attachment
# entirely client-side. File bytes are fetched through Redmine's native
# attachment download URL so session-based authorization always applies.
class ReaderController < ApplicationController
  layout nil

  before_action :find_attachment
  before_action :authorize_visibility

  def show
    # metadata consumed by reader.js (see app/views/reader/show.html.erb)
    @download_url = download_named_attachment_path(@attachment, @attachment.filename)
    respond_to do |format|
      format.html
    end
  end

  private

  def find_attachment
    @attachment = Attachment.find(params[:attachment_id])
  rescue ActiveRecord::RecordNotFound
    render_404
  end

  # Reuse Redmine's own attachment visibility rules: an attachment is
  # previewable only when the current user can see it (project membership,
  # permissions on the container, public projects, etc.).
  def authorize_visibility
    render_403 unless @attachment.visible?(User.current)
  end
end
