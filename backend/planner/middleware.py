from django.conf import settings
from django.http import HttpResponse


class CorsMiddleware:
    """Allow only configured frontend origins; no cookies or credentials used."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/") and request.method == "OPTIONS":
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)
        origin = request.headers.get("Origin")
        if request.path.startswith("/api/") and origin in settings.CORS_ALLOWED_ORIGINS:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type"
            response["Vary"] = "Origin"
        return response
