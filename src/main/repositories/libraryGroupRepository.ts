import crypto from 'node:crypto';
import type { SqliteDatabase } from '@main/database/database';
import type { LibraryGroup, LibraryGroupItemKind, LibraryGroupItemRef } from '@shared/types/domain';

type LibraryGroupRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  item_count: number;
};

type LibraryGroupItemRow = {
  item_kind: LibraryGroupItemKind;
  item_id: string;
};

export class LibraryGroupRepository {
  constructor(private readonly db: SqliteDatabase) {}

  listGroups(): LibraryGroup[] {
    const rows = this.db
      .prepare(
        `SELECT g.*, COUNT(i.item_id) AS item_count
         FROM library_group g
         LEFT JOIN library_group_item i ON i.group_id = g.id
         GROUP BY g.id
         ORDER BY g.updated_at DESC, g.rowid DESC`
      )
      .all() as LibraryGroupRow[];
    return rows.map(toGroup);
  }

  createGroup(title: string): LibraryGroup {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const normalizedTitle = normalizeTitle(title);
    this.db
      .prepare('INSERT INTO library_group (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, normalizedTitle, now, now);
    return this.getGroup(id) ?? {
      id,
      title: normalizedTitle,
      itemCount: 0,
      createdAt: now,
      updatedAt: now
    };
  }

  renameGroup(groupId: string, title: string): LibraryGroup {
    const normalizedTitle = normalizeTitle(title);
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE library_group SET title = ?, updated_at = ? WHERE id = ?')
      .run(normalizedTitle, now, groupId);
    const group = this.getGroup(groupId);
    if (!group) {
      throw new Error('Library group was not found.');
    }
    return group;
  }

  deleteGroup(groupId: string): void {
    this.db.prepare('DELETE FROM library_group WHERE id = ?').run(groupId);
  }

  listItemRefs(groupId: string): LibraryGroupItemRef[] {
    const rows = this.db
      .prepare(
        `SELECT item_kind, item_id
         FROM library_group_item
         WHERE group_id = ?
         ORDER BY added_at DESC, rowid DESC`
      )
      .all(groupId) as LibraryGroupItemRow[];
    return rows.map((row) => ({ kind: row.item_kind, id: row.item_id }));
  }

  addItem(groupId: string, item: LibraryGroupItemRef): void {
    this.assertGroupExists(groupId);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO library_group_item (group_id, item_kind, item_id, added_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(group_id, item_kind, item_id) DO NOTHING`
      )
      .run(groupId, item.kind, item.id, now);
    this.touchGroup(groupId);
  }

  removeItem(groupId: string, item: LibraryGroupItemRef): void {
    this.db
      .prepare('DELETE FROM library_group_item WHERE group_id = ? AND item_kind = ? AND item_id = ?')
      .run(groupId, item.kind, item.id);
    this.touchGroup(groupId);
  }

  deleteItemFromAllGroups(item: LibraryGroupItemRef): void {
    this.db
      .prepare('DELETE FROM library_group_item WHERE item_kind = ? AND item_id = ?')
      .run(item.kind, item.id);
  }

  private getGroup(groupId: string): LibraryGroup | null {
    const row = this.db
      .prepare(
        `SELECT g.*, COUNT(i.item_id) AS item_count
         FROM library_group g
         LEFT JOIN library_group_item i ON i.group_id = g.id
         WHERE g.id = ?
         GROUP BY g.id`
      )
      .get(groupId) as LibraryGroupRow | undefined;
    return row ? toGroup(row) : null;
  }

  private assertGroupExists(groupId: string): void {
    const row = this.db.prepare('SELECT id FROM library_group WHERE id = ?').get(groupId) as { id: string } | undefined;
    if (!row) {
      throw new Error('Library group was not found.');
    }
  }

  private touchGroup(groupId: string): void {
    this.db.prepare('UPDATE library_group SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), groupId);
  }
}

function toGroup(row: LibraryGroupRow): LibraryGroup {
  return {
    id: row.id,
    title: row.title,
    itemCount: row.item_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed ? trimmed.slice(0, 120) : 'Untitled Group';
}
