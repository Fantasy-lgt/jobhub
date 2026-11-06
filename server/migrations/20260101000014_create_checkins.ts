import type { Knex } from 'knex';

/** 14. 每日打卡（streak 由连续日期推导，不落库） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('checkins', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.date('checkin_date').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'checkin_date'], 'uq_checkin');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('checkins');
}
