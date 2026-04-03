/// Environment-specific configuration.
///
/// Values are read from `--dart-define` at build time.
/// Three presets: dev, staging, prod.
class AppConfig {
  const AppConfig({
    required this.env,
    required this.apiBaseUrl,
    this.apiTimeout = const Duration(seconds: 30),
  });

  final AppEnv env;
  final String apiBaseUrl;
  final Duration apiTimeout;

  /// Reads `ENV` from `--dart-define` and returns the matching config.
  static AppConfig fromEnvironment() {
    const env = String.fromEnvironment('ENV', defaultValue: 'dev');
    return switch (AppEnv.values.byName(env)) {
      AppEnv.dev => const AppConfig(
          env: AppEnv.dev,
          apiBaseUrl: 'http://localhost:3000',
        ),
      AppEnv.staging => const AppConfig(
          env: AppEnv.staging,
          apiBaseUrl: 'https://staging.example.com',
        ),
      AppEnv.prod => const AppConfig(
          env: AppEnv.prod,
          apiBaseUrl: 'https://api.example.com',
        ),
    };
  }
}

enum AppEnv { dev, staging, prod }
