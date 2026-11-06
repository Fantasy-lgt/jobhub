import type { Knex } from 'knex';

/** 2. 求职定位（1:1） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('profiles', (table) => {
    table.bigInteger('user_id').unsigned().primary();
    table.string('self_intro', 120).notNullable().defaultTo('');
    table.string('primary_role', 120).notNullable().defaultTo('');
    table.json('backup_roles').notNullable(); // ["运营"]
    table.json('industries').notNullable(); // ["SaaS","电商"]
    table.json('company_types').notNullable(); // ["互联网大厂"]
    table.json('cities').notNullable(); // ["上海","杭州"]
    table.integer('current_salary_base').notNullable().defaultTo(0); // 分/月
    table.tinyint('current_salary_months').unsigned().notNullable().defaultTo(12);
    table.integer('expect_floor').notNullable().defaultTo(0); // 分/月
    table.integer('expect_target').notNullable().defaultTo(0); // 分/月
    table.json('strengths').notNullable(); // [{"tag","evidence"}]
    table.json('gaps').notNullable(); // [{"gap","action"}]
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('profiles');
}
