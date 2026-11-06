import type { Knex } from 'knex';

/** 10. Offer 决策（年包读取时由 service 计算，不落库） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('offers', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.bigInteger('app_id').unsigned().nullable();
    table.string('company', 120).notNullable();
    table.string('role', 120).notNullable();
    table.string('city', 64).notNullable().defaultTo('');
    table.integer('base_salary').notNullable().defaultTo(0); // 月薪 分
    table.tinyint('salary_months').unsigned().notNullable().defaultTo(12);
    table.decimal('bonus_months', 4, 1).notNullable().defaultTo(0); // 绩效 月数
    table.integer('sign_bonus').notNullable().defaultTo(0); // 签字费 分
    table.integer('equity_value').notNullable().defaultTo(0); // 期权估值 元
    table.tinyint('equity_years').unsigned().notNullable().defaultTo(4); // 归属年限
    table.integer('allowance').notNullable().defaultTo(0); // 补贴 分/月
    table.decimal('fund_rate', 5, 2).notNullable().defaultTo(0); // 公积金比例 %
    table.date('deadline').nullable();
    table.json('weights').notNullable(); // {"money":40,"growth":25,"stability":20,"life":15}
    table.json('scores').notNullable(); // {"money":4,"growth":3,"stability":5,"life":4}
    table.string('top_concern', 255).notNullable().defaultTo('');
    table.string('notice_period', 32).notNullable().defaultTo('');
    table.boolean('non_compete').notNullable().defaultTo(false);
    table.boolean('social_security').notNullable().defaultTo(false);
    table.text('note').notNullable();
    table.timestamp('deleted_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id', 'deadline'], 'idx_offers_user');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('offers');
}
