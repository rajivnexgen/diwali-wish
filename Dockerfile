FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --system --uid 10001 --home /app appuser
COPY app.py voucher.js index.html ./
USER appuser
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:80/healthz', timeout=2)" || exit 1
CMD ["gunicorn", "--bind", "0.0.0.0:80", "--workers", "2", "--timeout", "45", "app:app"]
