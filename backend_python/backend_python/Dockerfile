# Imagen de produccion del backend. Multi-stage para no cargar herramientas
# de compilacion (gcc, headers) en la imagen final: psycopg[binary] y
# cryptography (via azure-storage-blob) ya traen wheels precompilados para
# linux/amd64, pero si algun dia dejan de traerlos, el stage `builder` es
# donde hay que agregar build-essential, no en la imagen final.

FROM python:3.11-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.11-slim

# Usuario sin privilegios: el proceso de la app no necesita ser root, y no
# tiene por que poder serlo si algo sale mal.
RUN useradd --create-home --uid 1000 appuser

WORKDIR /app

COPY --from=builder /root/.local /home/appuser/.local
COPY --chown=appuser:appuser main.py .
COPY --chown=appuser:appuser app ./app

USER appuser
ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

# Azure Container Apps (y la mayoria de los orquestadores) esperan el
# contenedor sirviendo en el puerto que ellos definan via $PORT; con valor
# por defecto para que `docker run` sin variables tambien funcione.
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"3001\")}/health')" || exit 1

# Shell form para que $PORT se expanda: Azure Container Apps y la mayoria de
# los PaaS inyectan el puerto real en tiempo de ejecucion, no en build time.
CMD python -m uvicorn main:app --host 0.0.0.0 --port ${PORT}
