SELECT
    tc.table_name AS tabela,
 
    CASE
        WHEN tc.table_name LIKE 'APEX$%'
          OR tc.table_name LIKE 'MLOG$%'
          OR tc.table_name LIKE 'CMP3$%'
          OR tc.table_name LIKE 'JAVA$%'
          OR tc.table_name LIKE 'CREATE$JAVA$%'
            THEN '(sem padrão)'
        WHEN INSTR(tc.table_name, '_') = 0
            THEN '(sem padrão)'
        ELSE SUBSTR(tc.table_name, 1, INSTR(tc.table_name, '_') - 1)
    END AS modulo,
 
    CASE
        WHEN tc.table_name LIKE 'APEX$%'
          OR tc.table_name LIKE 'MLOG$%'
          OR tc.table_name LIKE 'CMP3$%'
          OR tc.table_name LIKE 'JAVA$%'
          OR tc.table_name LIKE 'CREATE$JAVA$%'
            THEN 'Sistema (Oracle/APEX)'
        WHEN INSTR(tc.table_name, '_') = 0
            THEN 'Diversos/Não padronizado'
        WHEN SUBSTR(tc.table_name, 1, INSTR(tc.table_name, '_') - 1) LIKE '%W'
            THEN 'Trabalho/Temporária'
        ELSE 'Cadastro/Base'
    END AS tipo,
    tc.comments AS descricao
FROM ALL_TAB_COMMENTS tc
WHERE tc.owner      = USER
  AND tc.table_type = 'TABLE'
ORDER BY tabela ASC;
