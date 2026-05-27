from django.urls import path
from . import views

app_name = 'agent'

urlpatterns = [
    path('sessions/', views.list_sessions, name='list_sessions'),
    path('sessions/new/', views.create_session, name='create_session'),
    path('sessions/<uuid:session_id>/', views.get_session, name='get_session'),
    path('sessions/<uuid:session_id>/delete/', views.delete_session, name='delete_session'),
    path('sessions/<uuid:session_id>/files/', views.upload_files, name='upload_files'),
    path('sessions/<uuid:session_id>/stream/', views.stream_agent, name='stream_agent'),
    path('sessions/<uuid:session_id>/approve/', views.approve_action, name='approve_action'),
    path('sessions/<uuid:session_id>/stop/', views.stop_session, name='stop_session'),
    path('events/', views.get_events, name='get_events'),
    path('stats/', views.get_stats, name='get_stats'),
    path('webhooks/linear/', views.linear_webhook, name='linear_webhook'),
    path('linear/sync/', views.linear_sync, name='linear_sync'),
    path('memory/', views.list_memories, name='list_memories'),
    path('memory/<str:key>/', views.memory_detail, name='memory_detail'),
    path('schedules/', views.list_schedules, name='list_schedules'),
    path('schedules/<int:schedule_id>/', views.schedule_detail, name='schedule_detail'),
    path('action-items/', views.list_action_items, name='list_action_items'),
    path('action-items/<int:item_id>/<str:action>/', views.action_item_act, name='action_item_act'),
    path('projects/', views.list_or_create_projects, name='list_or_create_projects'),
    path('projects/<uuid:project_id>/', views.project_detail, name='project_detail'),
    path('context/user/', views.user_context, name='user_context'),
    path('context/repos/', views.list_repo_memories, name='list_repo_memories'),
    path('context/repos/<path:repo>/', views.repo_memory_detail, name='repo_memory_detail'),
    path('processes/', views.list_processes, name='list_processes'),
    path('processes/<int:process_id>/stop/', views.stop_process_view, name='stop_process_view'),
    path('processes/<int:process_id>/restart/', views.restart_process_view, name='restart_process_view'),
    path('processes/<int:process_id>/logs/', views.process_logs_stream, name='process_logs_stream'),
    path('processes/<int:process_id>/', views.delete_process_view, name='delete_process_view'),
]
