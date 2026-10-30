"""PostgreSQL for hosted durability; isolated SQLite for local demos/tests."""
from contextlib import contextmanager
import os
from pathlib import Path
import re
import shlex
import sqlite3
from urllib.parse import urlsplit


class DatabaseConfigError(ValueError):
    pass


def normalize_database_url(value):
    """Accept Neon copy formats as data. Never execute a copied psql command."""
    value=value.strip()
    if not value.startswith(('postgresql://','postgres://')):
        try:parts=shlex.split(value)
        except ValueError:raise DatabaseConfigError('Geçersiz PostgreSQL bağlantı biçimi') from None
        if len(parts)==2 and parts[0]=='psql':value=parts[1]
        elif len(parts)==2 and parts[0]=='export' and parts[1].startswith('DATABASE_URL='):
            value=parts[1].split('=',1)[1]
        elif len(parts)==1:
            value=parts[0]
            if value.startswith('DATABASE_URL='):value=value.split('=',1)[1]
        else:raise DatabaseConfigError('Yalnız PostgreSQL bağlantı adresi kabul edilir')
    try:
        parsed=urlsplit(value)
        valid=(parsed.scheme in ('postgresql','postgres') and parsed.hostname
               and not any(c.isspace() for c in value))
    except ValueError:valid=False
    if not valid:raise DatabaseConfigError('Geçersiz PostgreSQL bağlantı adresi')
    return value


class Connection:
    def __init__(self,raw,postgres):
        self.raw=raw;self.postgres=postgres

    def execute(self,sql,parameters=()):
        if self.postgres:
            sql=re.sub(r'\bBLOB\b','BYTEA',sql).replace('?','%s')
        return self.raw.execute(sql,parameters)

    def executescript(self,script):
        # Used only for the application's fixed, simple CREATE TABLE statements.
        for statement in script.split(';'):
            if statement.strip():self.execute(statement)

    def executemany(self,sql,rows):
        if self.postgres:sql=re.sub(r'\bBLOB\b','BYTEA',sql).replace('?','%s')
        cursor=self.raw.cursor();cursor.executemany(sql,rows)
        return cursor


class Database:
    def __init__(self,path,config=None):
        self.config=dict(os.environ if config is None else config)
        supplied=self.config.get('DATABASE_URL')
        self.url=normalize_database_url(supplied) if supplied else None
        self.persistent=bool(self.url)
        self.path=Path(path)
        if not self.persistent:self.path.parent.mkdir(parents=True,exist_ok=True)

    @contextmanager
    def connect(self):
        if self.persistent:
            import psycopg
            raw=psycopg.connect(self.url,sslmode='verify-full',
                sslrootcert=self.config.get('PGSSLROOTCERT','system'),connect_timeout=15)
        else:
            raw=sqlite3.connect(self.path,timeout=20)
        try:
            yield Connection(raw,self.persistent)
            raw.commit()
        except BaseException:
            raw.rollback()
            raise
        finally:
            raw.close()

    @property
    def identity_column(self):
        return 'BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY' if self.persistent else 'INTEGER PRIMARY KEY'

    def serialize_daily_writer(self,connection):
        if self.persistent:
            connection.execute('SELECT pg_advisory_xact_lock(?)',(73412026,))
        else:
            connection.execute('BEGIN IMMEDIATE')
