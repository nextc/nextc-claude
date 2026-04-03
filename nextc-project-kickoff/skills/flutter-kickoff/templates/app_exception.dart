/// Sealed error hierarchy for the application.
///
/// Every error surfaced to the UI uses a user-friendly [message].
/// The optional [cause] preserves the original error for debug logging.
sealed class AppException implements Exception {
  const AppException(this.message, [this.cause]);

  /// User-friendly message safe to display in the UI.
  final String message;

  /// Original error for debug logging. Never show to users.
  final Object? cause;

  @override
  String toString() => '$runtimeType: $message';
}

class NetworkException extends AppException {
  const NetworkException([
    String message = 'Unable to connect. Please check your internet.',
    Object? cause,
  ]) : super(message, cause);
}

class AuthException extends AppException {
  const AuthException([
    String message = 'Authentication failed. Please sign in again.',
    Object? cause,
  ]) : super(message, cause);
}

class StorageException extends AppException {
  const StorageException([
    String message = 'Could not save data. Please try again.',
    Object? cause,
  ]) : super(message, cause);
}

class ValidationException extends AppException {
  const ValidationException([
    String message = 'The information provided is not valid.',
    Object? cause,
  ]) : super(message, cause);
}

class UnexpectedException extends AppException {
  const UnexpectedException([
    String message = 'Something went wrong. Please try again.',
    Object? cause,
  ]) : super(message, cause);
}
