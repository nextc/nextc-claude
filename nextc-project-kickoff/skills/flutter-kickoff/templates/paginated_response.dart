import 'package:flutter/foundation.dart';

/// Generic pagination model for repository methods.
///
/// Used by all repository `findAll` methods to support cursor-based pagination.
@immutable
class PaginatedResponse<T> {
  const PaginatedResponse({
    required this.items,
    required this.hasMore,
    this.cursor,
    this.totalCount,
  });

  /// The items in this page.
  final List<T> items;

  /// Whether more items are available after this page.
  final bool hasMore;

  /// Opaque cursor for fetching the next page. Null if no more pages.
  final String? cursor;

  /// Total count of items across all pages, if known.
  final int? totalCount;
}
