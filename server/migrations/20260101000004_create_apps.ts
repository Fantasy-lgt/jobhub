import type { Knex } from 'knex';

/** 4. 岗位池（11 态状态机） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('apps', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.string('company', 120).notNullable();
    table.string('role', 120).notNullable();
    table.string('channel', 32).notNullable().defaultTo('其他');
    table.string('city', 64).notNullable().defaultTo('');
    table.string('work_mode', 16).notNullable().defaultTo('坐班');
    table.integer('salary_min').notNullable().defaultTo(0); // 分/月
    table.integer('salary_max').notNullable().defaultTo(0);
    table.tinyint('interest').unsigned().notNullable().defaultTo(3); // 1-5 星
    table.string('jd_url', 500).notNullable().defaultTo('');
    table.date('applied_at').nullable();
    table.bigInteger('resume_id').unsigned().nullable();
    table.string('contact_name', 64).notNullable().defaultTo('');
    table.string('contact_role', 32).notNullable().defaultTo('');
    table.string('contact_info', 255).notNullable().defaultTo('');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.string('next_action', 255).notNullable().defaultTo('');
    table.date('next_action_at').nullable();
    table.boolean('need_bg_check').notNullable().defaultTo(false);
    table.boolean('need_leave').notNullable().defaultTo(false);
    table.text('note').notNullable();
    table.timestamp('deleted_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id', 'status'], 'idx_apps_user_status');
    table.index(['user_id', 'channel'], 'idx_apps_user_channel');
    table.index(['user_id', 'applied_at'], 'idx_apps_user_applied');
    table.index(['resume_id'], 'idx_apps_resume');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.foreign('resume_id').references('resumes.id').onDelete('SET NULL');
    table.check(
      "status IN ('pending','applied','written','first','second','third','hr','offer','rejected','failed','dropped')",
      [],
      'chk_apps_status',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('apps');
}
