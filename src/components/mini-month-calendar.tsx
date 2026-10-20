"use client";

import { addMonths, format, isSameDay, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { startOfCalendarWeek } from "@/lib/calendar-utils";
import { miniMonthDays } from "@/lib/mini-month";

type MiniMonthCalendarProps = {
  viewStart: Date;
  visibleDays: Date[];
  today: Date;
  onSelectDate: (date: Date) => void;
};

export function MiniMonthCalendar({
  viewStart,
  visibleDays,
  today,
  onSelectDate,
}: MiniMonthCalendarProps) {
  const anchor = viewStart;
  const [navigation, setNavigation] = useState(() => ({
    anchor,
    month: startOfMonth(viewStart),
    previousMonth: null as Date | null,
    direction: 1,
    transition: 0,
  }));

  // Follow main-calendar navigation, while allowing independent month browsing.
  if (navigation.anchor !== anchor) {
    const month = startOfMonth(viewStart);
    setNavigation({
      anchor,
      month,
      previousMonth: month.getTime() === navigation.month.getTime() ? null : navigation.month,
      direction: month > navigation.month ? 1 : -1,
      transition: navigation.transition + 1,
    });
  }

  const navigateMonth = (direction: number) => {
    setNavigation((current) => ({
      ...current,
      month: addMonths(current.month, direction),
      previousMonth: current.month,
      direction,
      transition: current.transition + 1,
    }));
  };

  const renderDays = (month: Date, outgoing = false) => (
    <div
      aria-hidden={outgoing || undefined}
      className="mini-days"
      data-motion={outgoing ? "exit" : navigation.previousMonth ? "enter" : undefined}
      inert={outgoing || undefined}
      key={`${outgoing ? "outgoing" : "current"}-${navigation.transition}`}
      onAnimationEnd={outgoing ? undefined : () => {
        setNavigation((current) => current.transition === navigation.transition
          ? { ...current, previousMonth: null }
          : current);
      }}
    >
      {miniMonthDays(month).map((date) => {
        const isToday = isSameDay(date, today);
        const isViewed = visibleDays.some((day) => isSameDay(day, date));
        return (
          <button
            aria-current={isToday ? "date" : undefined}
            aria-label={format(date, "EEEE, MMMM d, yyyy")}
            className={`${isToday ? "mini-today" : ""} ${isViewed ? "mini-viewed" : ""}`}
            key={date.toISOString()}
            onClick={() => onSelectDate(startOfCalendarWeek(date))}
            type="button"
          >
            {format(date, "d")}
          </button>
        );
      })}
    </div>
  );

  return (
    <section aria-label="Mini calendar" className="mini-month">
      <div className="mini-month-heading">
        <strong aria-live="polite" aria-atomic="true">{format(navigation.month, "MMMM yyyy")}</strong>
        <span>
          <button aria-label="Previous month" onClick={() => navigateMonth(-1)} type="button">
            <ChevronLeft aria-hidden="true" size={13} />
          </button>
          <button aria-label="Next month" onClick={() => navigateMonth(1)} type="button">
            <ChevronRight aria-hidden="true" size={13} />
          </button>
        </span>
      </div>
      <div aria-hidden="true" className="mini-weekdays">
        {"MTWTFSS".split("").map((day, index) => <span key={index}>{day}</span>)}
      </div>
      <div className="mini-month-viewport" data-direction={navigation.direction > 0 ? "next" : "previous"}>
        {navigation.previousMonth && renderDays(navigation.previousMonth, true)}
        {renderDays(navigation.month)}
      </div>
    </section>
  );
}
