/// Material 3 responsive width breakpoints.
///
/// See: https://m3.material.io/foundations/layout/applying-layout/window-size-classes
abstract final class Breakpoints {
  /// Compact: phones in portrait (< 600dp).
  static const double compact = 600;

  /// Medium: tablets in portrait, foldables (600–839dp).
  static const double medium = 840;

  /// Expanded: tablets in landscape, small desktops (840–1199dp).
  static const double expanded = 1200;

  /// Large: desktops (1200–1599dp).
  static const double large = 1200;

  /// Extra-large: large desktops (≥ 1600dp).
  static const double extraLarge = 1600;
}
