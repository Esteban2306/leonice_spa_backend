import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const CONTENT_LIST_MAX_ITEMS = 12;
export const CONTENT_LIST_ITEM_MAX_LENGTH = 300;

export function NullableTrimmed() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  );
}

export function ContentList() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }): unknown =>
      Array.isArray(value)
        ? (value as unknown[])
            .map((item) => (typeof item === 'string' ? item.trim() : item))
            .filter((item) => item !== '')
        : value,
    ),
    IsOptional(),
    IsArray(),
    ArrayMaxSize(CONTENT_LIST_MAX_ITEMS),
    IsString({ each: true }),
    MaxLength(CONTENT_LIST_ITEM_MAX_LENGTH, { each: true }),
  );
}
