/// Abstract analytics interface.
///
/// Wire a real implementation (Firebase Analytics, Mixpanel, Amplitude, etc.)
/// when ready. The app ships with [NoopAnalytics] so nothing crashes.
abstract class AnalyticsService {
  /// Track a screen view.
  void trackScreen(String name);

  /// Track a custom event with optional parameters.
  void trackEvent(String name, [Map<String, Object>? params]);

  /// Set the current user ID for attribution. Pass null on sign-out.
  void setUserId(String? id);
}

/// No-op implementation used until a real analytics provider is wired.
class NoopAnalytics implements AnalyticsService {
  @override
  void trackScreen(String name) {}

  @override
  void trackEvent(String name, [Map<String, Object>? params]) {}

  @override
  void setUserId(String? id) {}
}
