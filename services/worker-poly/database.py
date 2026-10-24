"""
DEPRECATED: Workers now post analysis results to the Core API via HTTP:
  PATCH /sessions/{id}/status
  POST  /sessions/{id}/analysis

Direct database access from workers has been removed per architecture spec.
This file is retained as an empty module to prevent import breaks.
"""