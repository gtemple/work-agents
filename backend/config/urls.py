from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from django.http import FileResponse

FRONTEND_DIST = settings.BASE_DIR.parent / 'frontend' / 'dist'

def serve_spa(request, path=''):
    return FileResponse(open(FRONTEND_DIST / 'index.html', 'rb'))

urlpatterns = [
    path('api/', include('agent.urls')),
    re_path(r'^assets/(?P<path>.*)$', serve, {'document_root': FRONTEND_DIST / 'assets'}),
    re_path(r'^(?P<path>favicon\.svg|icons\.svg)$', serve, {'document_root': str(FRONTEND_DIST)}),
    re_path(r'^.*$', serve_spa),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
