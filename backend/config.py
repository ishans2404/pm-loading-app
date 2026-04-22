class Config:
    UPSTREAM_BASE: str = "https://bspapp.sail-bhilaisteel.com/MES_MOB/APP"
    LOADING_REPORT_CACHE_TTL: int = 6 * 3600
    DESTINATION_CACHE_TTL: int = 12 * 3600
    REQUEST_TIMEOUT: float = 900.0
    ALLOWED_ORIGINS: list[str] = ["http://localhost:8703", "http://127.0.0.1:8703", "http://10.145.8.23:8703"]


config = Config()
