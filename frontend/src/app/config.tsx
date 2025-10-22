const config = {
  backend_api_url:
    process.env.BACKEND_API_URL ||
    window.location.protocol +
      '//' +
      window.location.hostname +
      (window.location.port ? ':' + window.location.port : '') +
      '/api',
};

export default config;
