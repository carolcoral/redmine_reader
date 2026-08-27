# frozen_string_literal: true

RedmineApp::Application.routes.draw do
  get 'reader/:attachment_id', to: 'reader#show', as: 'redmine_reader_show'
end
