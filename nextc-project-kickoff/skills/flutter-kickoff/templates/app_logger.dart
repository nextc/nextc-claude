import 'package:flutter/foundation.dart';
import 'package:logger/logger.dart';

/// Debug-safe logging wrapper.
///
/// All output is suppressed in release builds via [kDebugMode].
/// Use [AppLogger.d] for debug messages, [AppLogger.e] for errors.
class AppLogger {
  AppLogger._();

  static final _logger = Logger(
    printer: PrettyPrinter(methodCount: 2, errorMethodCount: 5),
    level: kDebugMode ? Level.debug : Level.off,
  );

  /// Log a debug message. Suppressed in release builds.
  static void d(String message, {dynamic error, StackTrace? stackTrace}) =>
      _logger.d(message, error: error, stackTrace: stackTrace);

  /// Log an error. Suppressed in release builds.
  static void e(String message, {dynamic error, StackTrace? stackTrace}) =>
      _logger.e(message, error: error, stackTrace: stackTrace);

  /// Log a warning. Suppressed in release builds.
  static void w(String message, {dynamic error, StackTrace? stackTrace}) =>
      _logger.w(message, error: error, stackTrace: stackTrace);

  /// Log an info message. Suppressed in release builds.
  static void i(String message, {dynamic error, StackTrace? stackTrace}) =>
      _logger.i(message, error: error, stackTrace: stackTrace);
}
