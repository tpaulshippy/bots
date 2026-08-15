from pathlib import Path

from django.conf import settings
from django.http import Http404
from django.views.generic import TemplateView
from django.views.static import serve

WEB_APP_ROOT = Path(settings.BASE_DIR).parent / 'front' / 'dist'


class MarketingPageView(TemplateView):
    template_name = 'marketing.html'  # Ensure you have a template named marketing.html

class TutorialView(TemplateView):
    template_name = 'tutorial.html'


def web_app(request, path=''):
    requested_path = path.strip('/') or 'index.html'
    root = WEB_APP_ROOT.resolve()
    candidate = (root / requested_path).resolve()

    if not candidate.is_file() and not Path(requested_path).suffix:
        candidate = (root / f'{requested_path}.html').resolve()

    try:
        relative_path = candidate.relative_to(root)
    except ValueError as error:
        raise Http404 from error

    if not candidate.is_file():
        raise Http404

    return serve(request, relative_path.as_posix(), document_root=str(root))
