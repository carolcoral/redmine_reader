# frozen_string_literal: true

require File.expand_path('../../test_helper', __FILE__)

class ReaderFlowTest < Redmine::IntegrationTest
  fixtures :projects, :users, :roles, :members, :member_roles,
           :issues, :issue_statuses, :trackers, :enabled_modules, :attachments

  def test_logged_in_user_can_open_reader_for_visible_attachment
    log_user('admin', 'admin')

    attachment = Attachment.where(container_type: 'Issue').order(:id).first
    assert_not_nil attachment

    get "/reader/#{attachment.id}"
    assert_response :success
    assert_select 'title', /#{Regexp.escape(attachment.filename)}/
    assert_select '#rr-download'
    # i18n payload is present for the client-side renderer
    assert @response.body.include?('window.REDMINE_READER'),
           'expected reader bootstrap config in page body'
  end

  def test_anonymous_user_without_permission_is_rejected
    attachment = Attachment.where(container_type: 'Issue').order(:id).first
    with_settings login_required: '1' do
      get "/reader/#{attachment.id}"
      assert_response :redirect
      assert_match(/login/, @response.redirect_url)
    end
  end
end
