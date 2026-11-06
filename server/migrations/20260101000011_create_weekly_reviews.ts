import type { Knex } from 'knex';

/** 11. 周复盘 + 趋势改数 override */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('weekly_reviews', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.date('week_start').notNullable();
    table.integer('apply_override').nullable(); // NULL=真实统计；非 NULL=手工改数
    table.integer('interview_override').nullable();
    table.integer('offer_override').nullable();
    table.text('did_right').notNullable();
    table.text('did_wrong').notNullable();
    table.text('next_plan').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'week_start'], 'uq_week_user');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('weekly_reviews');
}
