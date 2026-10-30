"""Start the hosted panel with persistent storage and a credential-free health check."""
import os
from pathlib import Path
import shutil

from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
import uvicorn
from panel import create_app

ROOT=Path(__file__).resolve().parent


def seed_data(data_root):
    data_root=Path(data_root)
    for name in ('output','state'):
        source=ROOT/'seed'/name
        if not source.exists():
            continue
        for file in source.rglob('*'):
            if file.is_file():
                target=data_root/name/file.relative_to(source)
                if not target.exists():
                    target.parent.mkdir(parents=True,exist_ok=True)
                    shutil.copy2(file,target)


def hosted_app():
    data_root=Path(os.environ.get('DATA_DIR',str(ROOT)))
    data_root.mkdir(parents=True,exist_ok=True)
    seed_data(data_root)
    async def health(request):
        return JSONResponse({'status':'ok'})
    return Starlette(routes=[Route('/healthz',health),Mount('/',app=create_app())])


if __name__=='__main__':
    # Access logging is disabled because OAuth callbacks carry single-use codes.
    uvicorn.run(hosted_app(),host='0.0.0.0',port=int(os.environ.get('PORT','10000')),
                access_log=False,log_level='warning')
