from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import DATA_ROOT
from .db import init_db
from .routers import browse, media, operations, scans, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Czkawka Web GUI", lifespan=lifespan)

app.include_router(browse.router)
app.include_router(scans.router)
app.include_router(operations.router)
app.include_router(media.router)
app.include_router(settings.router)


@app.get("/api/config")
def get_config():
    """Lets the frontend strip DATA_ROOT off of displayed paths - it's just
    the mount point inside the container, not something the user should
    have to look at."""
    return {"data_root": str(DATA_ROOT)}
