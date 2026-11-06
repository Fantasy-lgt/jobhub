import type { Knex } from 'knex';

/** 5. 流转时间轴（每次状态变更写一行，不可手改） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('app_events', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('app_id').unsigned().notNullable();
    table.bigInteger('user_id').unsigned().notNullable();
    table.string('from_status', 20).notNullable();
    table.string('to_status', 20).notNullable();
    table.string('source', 32).notNullable().defaultTo('manual');
    table.timestamp('at').notNullable().defaultTo(knex.fn.now());
    table.index(['app_id', 'at'], 'idx_events_app');
    table.foreign('app_id').references('apps.id').onDelete('CASCADE');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('app_events');
}
