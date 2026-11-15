import React from "react";
import { View } from "react-native";
import { useData } from "../context";
import { Filters as FilterState } from "../domain";
import { Chips, Field, Txt } from "./UI";
export function Filters({
  value: f,
  onChange,
  calendar = false,
}: {
  value: FilterState;
  onChange: (v: FilterState) => void;
  calendar?: boolean;
}) {
  const { divisions, districts, categories } = useData();
  return (
    <View>
      <Field
        label="Search events, organizers, places or dates"
        placeholder="Find your next event"
        maxLength={200}
        value={f.query}
        onChangeText={(query) => onChange({ ...f, query })}
      />
      <Chips
        items={[{ id: 0, name: "All divisions" }, ...divisions]}
        value={f.division ?? 0}
        onChange={(id) =>
          onChange({ ...f, division: id || null, district: null })
        }
      />
      {!!f.division && (
        <Chips
          items={[
            { id: 0, name: "All districts" },
            ...districts.filter((d) => d.division_id === f.division),
          ]}
          value={f.district ?? 0}
          onChange={(id) => onChange({ ...f, district: id || null })}
        />
      )}
      <Chips
        items={[{ id: 0, name: "All categories" }, ...categories]}
        value={f.category ?? 0}
        onChange={(id) => onChange({ ...f, category: id || null })}
      />
      {!calendar && (
        <>
          <Chips
            items={[
              { id: "upcoming", name: "Upcoming" },
              { id: "today", name: "Today" },
              { id: "week", name: "This week" },
              { id: "month", name: "This month" },
              { id: "all", name: "All dates" },
            ]}
            value={f.period}
            onChange={(period) => onChange({ ...f, period })}
          />
          <Field
            label="Exact date (optional, YYYY-MM-DD)"
            value={f.date ?? ""}
            placeholder="2026-12-01"
            onChangeText={(date) => onChange({ ...f, date })}
          />
          <Chips
            items={[
              { id: "date", name: "By date" },
              { id: "popularity", name: "Most saved" },
              { id: "rating", name: "Highest-rated organizers" },
            ]}
            value={f.sort}
            onChange={(sort) => onChange({ ...f, sort })}
          />
        </>
      )}
      <Chips
        items={[
          { id: "all", name: "Any price" },
          { id: "free", name: "Free" },
          { id: "paid", name: "Paid" },
        ]}
        value={f.price}
        onChange={(price) => onChange({ ...f, price })}
      />
    </View>
  );
}
