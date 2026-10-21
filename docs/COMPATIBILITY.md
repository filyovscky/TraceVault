# Лицензии и OSINTchart

SingleFile: https://github.com/gildas-lormeau/SingleFile — AGPL-3.0, не permissive зависимость. Изучается отдельный reference checkout; код не копируется и не включается. Собственный движок не называется SingleFile и не обещает эквивалентное покрытие. Дальнейшее включение SingleFile требует отдельного решения о лицензировании всего производного произведения или коммерческой лицензии. Это инженерная проверка условий исходных лицензий, не заключение юриста.

Runtime: только собственный JS и Web/Chrome API, внешних библиотек нет. Dev-only зависимости перечисляются в package-lock.json и LICENSES.md.

OSINTchart reference: commit `1e90238a1cc8ac4e178fb534235112b9c7fec4ed` (получен git clone 22.10.2026). Изучены models/types.py, services/case_service.py, docs/ENTITY_LIBRARIES_AND_EVIDENCE.md. SCHEMA_VERSION=2; GraphEntity.id строка UUID, entity_type из EntityType; все 13 типов TraceVault присутствуют. EvidenceMeta.evidence_refs — list[str], integrity_hashes — dict[str,str]. Нельзя передавать богатые объекты вместо строк. verification по умолчанию у модели verified/1.0; сервис новых объектов выставляет unconfirmed/0.5. Адаптер обязан явно сохранить unconfirmed и отсутствие оценки TraceVault, а не выдавать 0.5 за вероятность.

P0 экспорт TraceVault v1 — отдельный обменный формат, НЕ файл дела OSINTchart. Массив evidence содержит Capture, evidence_refs — объекты ссылок. Для будущего импортёра GraphEntity.id = entity_id, attributes.tracevault = raw/normalized/confidence; meta.evidence_refs = reference_id; богатые refs должны храниться в отдельном реестре/attributes до поддержки целевым приложением. Метаданные источника: meta.source_url, acquired_at; artifact_id → SHA-256 хранится с явной привязкой, не единый хеш Entity. relations по умолчанию пуст; совместное упоминание не создаёт owns.

Импортёр через CaseService.add_entity/update_entity, предварительный просмотр, проверку существующих UUID/конфликтов и явное подтверждение. P0 не редактирует .oscase/.osint и не рисует кнопку прямой отправки. Проверка повторного импорта в реальный OSINTchart пока не выполнена; её нельзя считать закрытой экспортом.
