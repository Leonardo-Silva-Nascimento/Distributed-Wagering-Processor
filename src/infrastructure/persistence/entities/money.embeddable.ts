import { Embeddable, Property } from '@mikro-orm/core';

@Embeddable()
export class MoneyEmbeddable {
  @Property({ type: 'varchar', length: 30, columnType: 'varchar(30)' })
  amount!: string;

  @Property({ type: 'varchar', length: 3, columnType: 'char(3)' })
  currency!: string;
}
