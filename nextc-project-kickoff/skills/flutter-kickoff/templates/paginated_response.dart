import 'dart:collection';

import 'package:flutter/foundation.dart';

/// Generic pagination model for repository methods.
///
/// Used by all repository `findAll` methods to support cursor-based pagination.
/// The [items] list is unmodifiable — callers cannot accidentally mutate it.
@immutable
class PaginatedResponse<T> {
  PaginatedResponse({
    required List<T> items,
    required this.hasMore,
    this.cursor,
    this.totalCount,
  }) : items = UnmodifiableListView(items);

  /// The items in this page. Unmodifiable.
  final List<T> items;

  /// Whether more items are available after this page.
  final bool hasMore;

  /// Opaque cursor for fetching the next page. Null if no more pages.
  final String? cursor;

  /// Total count of items across all pages, if known.
  final int? totalCount;
}
