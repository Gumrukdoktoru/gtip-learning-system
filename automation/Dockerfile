# syntax=docker/dockerfile:1
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/var/data
WORKDIR /app
COPY requirements-runtime.txt ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -r /run/secrets/proxy_ca ]; then \
      PIP_CERT=/run/secrets/proxy_ca pip install --no-cache-dir -r requirements-runtime.txt; \
    else \
      pip install --no-cache-dir -r requirements-runtime.txt; \
    fi
COPY panel.py social_connections.py serve.py database.py object_store.py daily_planner.py private_import.py card_renderer.py daily_worker.py ./
COPY config.json ./
COPY assets ./assets
COPY seed ./seed
EXPOSE 10000
CMD ["python", "serve.py"]
