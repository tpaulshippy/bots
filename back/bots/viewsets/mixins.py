import uuid

from django.core.exceptions import ObjectDoesNotExist
from rest_framework.exceptions import NotFound


def get_object_by_uuid_or_id(queryset, uuid_field_name, raw_value):
    """Look up an object by its UUID field or integer id, raising NotFound on failure."""
    try:
        uuid_value = uuid.UUID(raw_value)
        return queryset.get(**{uuid_field_name: uuid_value})
    except (ValueError, ObjectDoesNotExist):
        pass

    try:
        return queryset.get(id=raw_value)
    except (ValueError, ObjectDoesNotExist):
        raise NotFound(f"{queryset.model.__name__} not found")
