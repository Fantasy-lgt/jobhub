import type { Knex } from 'knex';

/** 6. 面试复盘（单场面试） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('interviews', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.bigInteger('app_id').unsigned().nullable();
    table.string('company', 120).notNullable();
    table.string('role', 120).notNullable();
    table.string('round', 32).notNullable().defaultTo('一面');
    table.date('scheduled_at').nullable();
    table.string('format', 16).notNullable().defaultTo('视频');
    table.string('interviewer', 255).notNullable().defaultTo('');
    table.string('result', 16).notNullable().defaultTo('等通知');
    table.json('self_scores').nullable(); // null=未评 {"content":4,"expression":5,"mindset":3,"interaction":4}
    table.text('done_right').notNullable();
    table.text('pitfall').notNullable();
    table.text('next_step').notNullable();
    table.string('one_line', 80).notNullable().defaultTo('');
    table.timestamp('deleted_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id', 'scheduled_at'], 'idx_interviews_user');
    table.index(['app_id'], 'idx_interviews_app');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.foreign('app_id').references('apps.id').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('interviews');
}
