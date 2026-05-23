from django.urls import path
from . import views

urlpatterns = [
    path('sessions/', views.list_sessions),
    path('sessions/new/', views.create_session),
    path('sessions/<uuid:session_id>/', views.get_session),
    path('sessions/<uuid:session_id>/files/', views.upload_files),
    path('sessions/<uuid:session_id>/stream/', views.stream_agent),
    path('sessions/<uuid:session_id>/approve/', views.approve_action),
    path('stats/', views.get_stats),
    path('memory/', views.list_memories),
    path('memory/<str:key>/', views.memory_detail),
    path('schedules/', views.list_schedules),
    path('schedules/<int:schedule_id>/', views.schedule_detail),
]
