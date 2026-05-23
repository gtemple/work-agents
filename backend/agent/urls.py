from django.urls import path
from . import views

urlpatterns = [
    path('sessions/', views.list_sessions),
    path('sessions/new/', views.create_session),
    path('sessions/<uuid:session_id>/', views.get_session),
    path('sessions/<uuid:session_id>/files/', views.upload_files),
    path('sessions/<uuid:session_id>/stream/', views.stream_agent),
]
