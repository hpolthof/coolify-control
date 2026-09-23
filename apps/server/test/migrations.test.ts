import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/index';
import { migrate } from '../src/db/migrations';

describe('migration 3: 24-column dashboard grid', () => {
  it('doubles the position and size of every stored widget, once', () => {
    const db = openDatabase(':memory:');
    const widgets = [
      { i: 'a', type: 'overview', x: 0, y: 0, w: 12, h: 3, config: {} },
      { i: 'b', type: 'server', x: 4, y: 3, w: 4, h: 7, config: { serverUuid: 's1' } },
    ];
    const now = new Date().toISOString();
    db.prepare('INSERT INTO dashboards (name, position, widgets_json, created_at, updated_at) VALUES (?, 0, ?, ?, ?)').run(
      'Old',
      JSON.stringify(widgets),
      now,
      now,
    );
    // Pretend this database was created before migration 3.
    db.exec('PRAGMA user_version = 2');
    migrate(db);
    migrate(db); // running again must not double twice

    const row = db.prepare('SELECT widgets_json FROM dashboards').get() as { widgets_json: string };
    const out = JSON.parse(row.widgets_json);
    expect(out[0]).toMatchObject({ x: 0, y: 0, w: 24, h: 6 });
    expect(out[1]).toMatchObject({ x: 8, y: 6, w: 8, h: 14, config: { serverUuid: 's1' } });
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(3);
  });
});
