export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = error.code === 'LIMIT_FILE_SIZE'
    ? 413
    : Number.isInteger(error.status)
      ? error.status
      : error.name === 'MulterError'
        ? 400
        : 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'An unexpected server error occurred'
    : error.message || 'An unexpected server error occurred';

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    success: false,
    message,
    ...(error.details ? { errors: error.details } : {})
  });
}
