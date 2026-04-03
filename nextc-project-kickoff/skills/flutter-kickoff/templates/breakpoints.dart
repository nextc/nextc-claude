/// Material 3 responsive width breakpoints.
///
/// Each constant is the minimum width (in dp) where the window class begins.
/// Usage: `if (width >= Breakpoints.expanded) { /* tablet layout */ }`
///
/// See: https://m3.material.io/foundations/layout/applying-layout/window-size-classes
abstract final class Breakpoints {
  /// Medium: tablets in portrait, foldables (≥ 600dp).
  static const double medium = 600;

  /// Expanded: tablets in landscape, small desktops (≥ 840dp).
  static const double expanded = 840;

  /// Large: desktops (≥ 1200dp).
  static const double large = 1200;

  /// Extra-large: large desktops (≥ 1600dp).
  static const double extraLarge = 1600;
}
