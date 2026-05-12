export function cleanDisplayNameSql(expression: string): string {
  return `
    CASE
      WHEN ${expression} IS NOT NULL
        AND TRIM(${expression}) <> ''
        AND TRIM(${expression}) NOT LIKE '%=%'
        AND TRIM(${expression}) NOT LIKE '%GIAB%'
        AND TRIM(${expression}) NOT LIKE '%@lid'
      THEN TRIM(${expression})
      ELSE NULL
    END
  `;
}

export function contactDisplayNameSql(alias: string): string {
  return `
    COALESCE(
      ${cleanDisplayNameSql(`${alias}.full_name`)},
      ${cleanDisplayNameSql(`${alias}.business_name`)},
      ${cleanDisplayNameSql(`COALESCE(${alias}.first_name, '') || ' ' || COALESCE(${alias}.last_name, '')`)},
      ${cleanDisplayNameSql(`${alias}.first_name`)},
      ${cleanDisplayNameSql(`${alias}.username`)},
      ${cleanDisplayNameSql(`${alias}.phone`)}
    )
  `;
}

export function contactMatchSql(alias: string, jidExpression: string): string {
  return `(${alias}.jid = ${jidExpression} OR ${alias}.lid = ${jidExpression})`;
}
