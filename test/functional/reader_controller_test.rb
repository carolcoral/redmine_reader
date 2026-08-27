# frozen_string_literal: true

require File.expand_path('../../test_helper', __FILE__)

class ReaderControllerTest < Redmine::ControllerTest
  fixtures :projects, :users, :roles, :members, :member_roles,
           :issues, :issue_statuses, :trackers, :enabled_modules, :attachments

  def setup
    @attachment = Attachment.where(container_type: 'Issue').order(:id).first
    assert_not_nil @attachment, 'expected an issue attachment fixture'
  end

  def test_show_renders_reader_page_for_authorized_user
    @request.session[:user_id] = users(:admin).id

    get :show, params: {attachment_id: @attachment.id}

    assert_response :success
    assert_select 'title', /#{Regexp.escape(@attachment.filename)}/
    # metadata consumed by reader.js
    assert_select 'body.rr-body'
    assert_select '#rr-viewport'
    assert_select '#rr-download'
    assert_select '#rr-download[href=?]',
                  "/attachments/download/#{@attachment.id}/#{ERB::Util.url_encode(@attachment.filename)}"
  end

  def test_show_denies_attachment_the_user_cannot_see
    private_project = Project.where(is_public: false).first
    assert_not_nil private_project, 'expected a private project fixture'
    issue = Issue.generate!(project: private_project)
    attachment = Attachment.generate!(container: issue, filename: 'secret.pdf')

    # jsmith has no membership in the private project
    @request.session[:user_id] = users(:users_001).id

    get :show, params: {attachment_id: attachment.id}

    assert_response 403
  end

  def test_show_returns_404_for_missing_attachment
    @request.session[:user_id] = users(:admin).id

    get :show, params: {attachment_id: 9_999_999}

    assert_response 404
  end
end
