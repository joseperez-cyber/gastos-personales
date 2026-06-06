import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./supabase";
import "./Appgastos.css";

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthRange(selectedDate) {
  const firstDay = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    1
  );
  const lastDay = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth() + 1,
    0
  );

  return {
    start: formatDate(firstDay),
    end: formatDate(lastDay),
    monthName: selectedDate.toLocaleDateString("es-MX", {
      month: "long",
      year: "numeric",
    }),
  };
}

function getTodayDate() {
  return formatDate(new Date());
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(value || 0));
}

function safeFileName(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
}

// ── Login ─────────────────────────────────────────────────────────────────────
function AuthScreen({ onMessage }) {
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  async function handleAuth(event) {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      onMessage("Escribe tu correo y contraseña.", "error");
      return;
    }

    if (password.length < 6) {
      onMessage("La contraseña debe tener al menos 6 caracteres.", "error");
      return;
    }

    setAuthLoading(true);

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        onMessage("No se pudo iniciar sesión. Revisa tus datos.", "error");
        setAuthLoading(false);
        return;
      }

      onMessage("Sesión iniciada.");
    } else {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        onMessage("No se pudo crear la cuenta.", "error");
        setAuthLoading(false);
        return;
      }

      onMessage("Cuenta creada. Revisa tu correo si Supabase pide confirmación.");
    }

    setAuthLoading(false);
  }

  return (
    <main className="app">
      <section className="card auth-card">
        <p className="eyebrow">Gastos personales</p>
        <h1>{authMode === "login" ? "Iniciar sesión" : "Crear cuenta"}</h1>

        <form onSubmit={handleAuth} className="form">
          <label>
            Correo
            <input
              type="email"
              placeholder="tu-correo@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button type="submit" disabled={authLoading}>
            {authLoading
              ? "Cargando..."
              : authMode === "login"
              ? "Entrar"
              : "Crear cuenta"}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch"
          onClick={() =>
            setAuthMode(authMode === "login" ? "signup" : "login")
          }
        >
          {authMode === "login"
            ? "No tengo cuenta, crear una"
            : "Ya tengo cuenta, iniciar sesión"}
        </button>
      </section>
    </main>
  );
}

// ── Teclado numérico ──────────────────────────────────────────────────────────
function NumericKeyboard({ value, onChange, onConfirm, onClose }) {
  function press(key) {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
    } else if (key === ".") {
      if (!value.includes(".")) onChange(value + ".");
    } else {
      const parts = value.split(".");
      if (parts[1] !== undefined && parts[1].length >= 2) return;
      onChange(value + key);
    }
  }

  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"];

  return (
    <div className="numkb-overlay" onClick={onClose}>
      <div className="numkb-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="numkb-display">
          <span className="numkb-currency">$</span>
          <span className="numkb-value">{value || "0"}</span>
        </div>

        <div className="numkb-grid">
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              className={`numkb-key ${key === "⌫" ? "numkb-key--del" : ""}`}
              onClick={() => press(key)}
            >
              {key}
            </button>
          ))}
        </div>

        <button type="button" className="numkb-confirm" onClick={onConfirm}>
          Listo ✓
        </button>
      </div>
    </div>
  );
}

// ── Toast message ─────────────────────────────────────────────────────────────
function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className={`toast toast--${type}`} onClick={onClose}>
      <span>{message}</span>
    </div>
  );
}

// ── App principal ─────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expenseDate, setExpenseDate] = useState(getTodayDate());

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryBudget, setNewCategoryBudget] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const [kbOpen, setKbOpen] = useState(false);
  const [kbBudgetOpen, setKbBudgetOpen] = useState(false);

  const [actionsOpen, setActionsOpen] = useState(false);
  const expenseFormRef = useRef(null);

  const monthRange = getMonthRange(selectedMonth);

  const showMessage = useCallback((text, type = "success") => {
    setMessage(text);
    setMessageType(type);
  }, []);

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        showMessage("No se pudo cargar la sesión.", "error");
      }

      setSession(data.session);
      setSessionLoading(false);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [showMessage]);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchData();
  }, [selectedMonth, session?.user?.id]);

  async function fetchData() {
    if (!session?.user?.id) return;

    setLoading(true);

    const { data: categoriesData, error: categoriesError } = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: true });

    if (categoriesError) {
      showMessage("Error al cargar las categorías.", "error");
      setLoading(false);
      return;
    }

    const { data: expensesData, error: expensesError } = await supabase
      .from("expenses")
      .select("*, categories(name)")
      .eq("user_id", session.user.id)
      .gte("expense_date", monthRange.start)
      .lte("expense_date", monthRange.end)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (expensesError) {
      showMessage("Error al cargar los gastos.", "error");
      setLoading(false);
      return;
    }

    setCategories(categoriesData || []);
    setExpenses(expensesData || []);

    if ((categoriesData || []).length > 0 && !categoryId) {
      setCategoryId(categoriesData[0].id);
    }

    setLoading(false);
  }

  async function addExpense(event) {
    event.preventDefault();

    if (!session?.user?.id) {
      showMessage("Inicia sesión para guardar gastos.", "error");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      showMessage("Escribe un monto válido.", "error");
      return;
    }

    if (!categoryId) {
      showMessage("Selecciona una categoría.", "error");
      return;
    }

    const { error } = await supabase.from("expenses").insert({
      amount: Number(amount),
      description: description.trim(),
      expense_date: expenseDate,
      category_id: categoryId,
      user_id: session.user.id,
    });

    if (error) {
      showMessage("No se pudo guardar el gasto.", "error");
      return;
    }

    setAmount("");
    setDescription("");
    setExpenseDate(getTodayDate());
    showMessage("✅ Gasto guardado.");
    await fetchData();
  }

  async function deleteExpense(id) {
    const confirmDelete = window.confirm("¿Quieres borrar este gasto?");
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id);

    if (error) {
      showMessage("No se pudo borrar el gasto.", "error");
      return;
    }

    showMessage("🗑 Gasto borrado.");
    await fetchData();
  }

  async function addCategory(event) {
    event.preventDefault();

    if (!session?.user?.id) {
      showMessage("Inicia sesión para crear categorías.", "error");
      return;
    }

    if (!newCategoryName.trim()) {
      showMessage("Escribe el nombre de la categoría.", "error");
      return;
    }

    if (!newCategoryBudget || Number(newCategoryBudget) < 0) {
      showMessage("Escribe un presupuesto válido.", "error");
      return;
    }

    const { error } = await supabase.from("categories").insert({
      name: newCategoryName.trim(),
      monthly_budget: Number(newCategoryBudget),
      user_id: session.user.id,
    });

    if (error) {
      showMessage("No se pudo crear la categoría.", "error");
      return;
    }

    setNewCategoryName("");
    setNewCategoryBudget("");
    showMessage("📂 Categoría creada.");
    await fetchData();
  }

  async function updateCategoryBudget(catId, newBudget) {
    if (newBudget === "" || Number(newBudget) < 0) {
      showMessage("Presupuesto inválido.", "error");
      return;
    }

    const { error } = await supabase
      .from("categories")
      .update({ monthly_budget: Number(newBudget) })
      .eq("id", catId)
      .eq("user_id", session.user.id);

    if (error) {
      showMessage("No se pudo actualizar el presupuesto.", "error");
      return;
    }

    showMessage("Presupuesto actualizado.");
    await fetchData();
  }

  async function updateCategoryName(catId, newName) {
    if (!newName.trim()) {
      showMessage("El nombre no puede quedar vacío.", "error");
      return;
    }

    const { error } = await supabase
      .from("categories")
      .update({ name: newName.trim() })
      .eq("id", catId)
      .eq("user_id", session.user.id);

    if (error) {
      showMessage("No se pudo actualizar el nombre.", "error");
      return;
    }

    showMessage("Categoría actualizada.");
    await fetchData();
  }

  async function deleteCategory(catId) {
    const confirmDelete = window.confirm(
      "¿Quieres borrar esta categoría? También se borrarán sus gastos."
    );

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", catId)
      .eq("user_id", session.user.id);

    if (error) {
      showMessage("No se pudo borrar la categoría.", "error");
      return;
    }

    showMessage("🗑 Categoría borrada.");
    await fetchData();
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      showMessage("No se pudo cerrar sesión.", "error");
      return;
    }

    setCategories([]);
    setExpenses([]);
    setCategoryId("");
    showMessage("Sesión cerrada.");
  }

  function goToPreviousMonth() {
    setSelectedMonth(
      new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1)
    );
  }

  function goToNextMonth() {
    setSelectedMonth(
      new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1)
    );
  }

  function goToCurrentMonth() {
    setSelectedMonth(new Date());
  }

  function scrollToExpenseForm() {
    expenseFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const summary = useMemo(() => {
    const categoriesWithTotals = categories.map((category) => {
      const totalSpent = expenses
        .filter((expense) => expense.category_id === category.id)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

      const budget = Number(category.monthly_budget || 0);

      return {
        ...category,
        budget,
        totalSpent,
        remaining: budget - totalSpent,
      };
    });

    const totalBudget = categoriesWithTotals.reduce(
      (sum, category) => sum + category.budget,
      0
    );

    const totalSpent = categoriesWithTotals.reduce(
      (sum, category) => sum + category.totalSpent,
      0
    );

    return {
      categoriesWithTotals,
      totalBudget,
      totalSpent,
      totalRemaining: totalBudget - totalSpent,
    };
  }, [categories, expenses]);

  function buildWhatsAppText() {
    let text = `*Gastos - ${monthRange.monthName}*\n\n`;

    text += `*Resumen general*\n`;
    text += `Presupuesto: ${formatMoney(summary.totalBudget)}\n`;
    text += `Gastado: ${formatMoney(summary.totalSpent)}\n`;
    text += `Restante: ${formatMoney(summary.totalRemaining)}\n\n`;

    summary.categoriesWithTotals.forEach((category) => {
      if (category.budget === 0 && category.totalSpent === 0) return;

      const categoryExpenses = expenses.filter(
        (expense) => expense.category_id === category.id
      );

      text += `*${category.name}*\n`;
      text += `${formatMoney(category.totalSpent)} / ${formatMoney(
        category.budget
      )}`;

      text +=
        category.remaining < 0
          ? ` — excedido por ${formatMoney(Math.abs(category.remaining))}\n`
          : ` — quedan ${formatMoney(category.remaining)}\n`;

      if (categoryExpenses.length > 0) {
        categoryExpenses.forEach((expense) => {
          text += `• ${formatMoney(expense.amount)} | ${
            expense.description || "Sin descripción"
          } | ${expense.expense_date}\n`;
        });
      } else {
        text += `• Sin gastos registrados\n`;
      }

      text += `\n`;
    });

    return text.trim();
  }

  async function copyWhatsAppSummary() {
    try {
      await navigator.clipboard.writeText(buildWhatsAppText());
      showMessage("Resumen copiado para WhatsApp.");
    } catch {
      showMessage("No se pudo copiar el resumen.", "error");
    }
  }

  function openWhatsAppSummary() {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(buildWhatsAppText())}`,
      "_blank"
    );
  }

  async function sharePdfSummary() {
    try {
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text(`Gastos - ${monthRange.monthName}`, 14, 18);

      doc.setFontSize(11);
      doc.text(`Presupuesto: ${formatMoney(summary.totalBudget)}`, 14, 30);
      doc.text(`Gastado: ${formatMoney(summary.totalSpent)}`, 14, 38);
      doc.text(`Restante: ${formatMoney(summary.totalRemaining)}`, 14, 46);

      autoTable(doc, {
        startY: 56,
        head: [["Categoría", "Presupuesto", "Gastado", "Restante"]],
        body: summary.categoriesWithTotals
          .filter((category) => category.budget > 0 || category.totalSpent > 0)
          .map((category) => [
            category.name,
            formatMoney(category.budget),
            formatMoney(category.totalSpent),
            formatMoney(category.remaining),
          ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [17, 24, 39] },
      });

      const finalY = doc.lastAutoTable.finalY + 10;

      autoTable(doc, {
        startY: finalY,
        head: [["Fecha", "Categoría", "Descripción", "Monto"]],
        body:
          expenses.length > 0
            ? expenses.map((expense) => [
                expense.expense_date,
                expense.categories?.name || "Sin categoría",
                expense.description || "Sin descripción",
                formatMoney(expense.amount),
              ])
            : [["", "", "Sin gastos registrados", ""]],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [22, 101, 52] },
      });

      const pdfBlob = doc.output("blob");
      const fileName = `gastos-${safeFileName(monthRange.monthName)}.pdf`;
      const file = new File([pdfBlob], fileName, { type: "application/pdf" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Gastos - ${monthRange.monthName}`,
          files: [file],
        });

        showMessage("PDF listo para compartir.");
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement("a");

        link.href = url;
        link.download = fileName;
        link.click();

        URL.revokeObjectURL(url);
        showMessage("PDF descargado.");
      }
    } catch {
      showMessage("No se pudo generar el PDF.", "error");
    }
  }

  const isOverall = summary.totalRemaining < 0;

  if (sessionLoading) {
    return (
      <main className="app">
        <section className="card">
          <h2>Cargando...</h2>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <>
        <Toast
          message={message}
          type={messageType}
          onClose={() => setMessage("")}
        />
        <AuthScreen onMessage={showMessage} />
      </>
    );
  }

  return (
    <main className="app">
      <Toast
        message={message}
        type={messageType}
        onClose={() => setMessage("")}
      />

      {kbOpen && (
        <NumericKeyboard
          value={amount}
          onChange={setAmount}
          onConfirm={() => setKbOpen(false)}
          onClose={() => setKbOpen(false)}
        />
      )}

      {kbBudgetOpen && (
        <NumericKeyboard
          value={newCategoryBudget}
          onChange={setNewCategoryBudget}
          onConfirm={() => setKbBudgetOpen(false)}
          onClose={() => setKbBudgetOpen(false)}
        />
      )}

      <header className="header">
        <div className="header-top">
          <div>
            <p className="eyebrow">Gastos del mes</p>
            <h1>{monthRange.monthName}</h1>
          </div>

          <button type="button" className="signout-button" onClick={signOut}>
            Salir
          </button>
        </div>

        <p className="user-email">{session.user.email}</p>

        <div className="month-controls">
          <button type="button" onClick={goToPreviousMonth}>
            ← Anterior
          </button>

          <button type="button" onClick={goToCurrentMonth}>
            Hoy
          </button>

          <button type="button" onClick={goToNextMonth}>
            Siguiente →
          </button>
        </div>
      </header>

      <section className="totals">
        <div>
          <span>Presupuesto</span>
          <strong>{formatMoney(summary.totalBudget)}</strong>
        </div>

        <div>
          <span>Gastado</span>
          <strong>{formatMoney(summary.totalSpent)}</strong>
        </div>

        <div className={isOverall ? "total-danger" : ""}>
          <span>Restante</span>
          <strong>{formatMoney(summary.totalRemaining)}</strong>
          {isOverall && <em className="over-label">¡Excedido!</em>}
        </div>
      </section>

      <section className="card add-expense-card" ref={expenseFormRef}>
        <h2>Agregar gasto</h2>

        <form onSubmit={addExpense} className="form">
          <label>
            Monto
            <div className="amount-display" onClick={() => setKbOpen(true)}>
              <span className="amount-display__currency">$</span>
              <span className="amount-display__value">
                {amount ? (
                  Number(amount).toLocaleString("es-MX")
                ) : (
                  <span className="amount-display__placeholder">
                    Toca para ingresar
                  </span>
                )}
              </span>
              <span className="amount-display__icon">🔢</span>
            </div>
          </label>

          <label>
            Categoría
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.length === 0 && (
                <option value="">No hay categorías</option>
              )}

              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Descripción
            <input
              type="text"
              placeholder="Ej. Tacos, Uber, caseta..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <label>
            Fecha
            <input
              type="date"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
            />
          </label>

          <button type="submit" disabled={categories.length === 0}>
            Guardar gasto
          </button>
        </form>
      </section>

      <section className="categories">
        {summary.categoriesWithTotals.map((category) => {
          const percentage =
            category.budget > 0
              ? Math.min((category.totalSpent / category.budget) * 100, 100)
              : 0;

          const isOver = category.remaining < 0;
          const pctColor =
            percentage > 90
              ? "#dc2626"
              : percentage > 70
              ? "#f59e0b"
              : "#22c55e";

          return (
            <article
              className={`category-card ${isOver ? "over-budget" : ""}`}
              key={category.id}
            >
              <div className="category-header">
                <h3>{category.name}</h3>
                <span className={isOver ? "badge badge--danger" : "badge badge--ok"}>
                  {isOver
                    ? `⚠ +${formatMoney(Math.abs(category.remaining))}`
                    : `✓ ${formatMoney(category.remaining)}`}
                </span>
              </div>

              <p>
                {formatMoney(category.totalSpent)} / {formatMoney(category.budget)}
              </p>

              <div className="progress">
                <div
                  className="progress-fill"
                  style={{ width: `${percentage}%`, background: pctColor }}
                />
              </div>

              <div className="progress-pct">{Math.round(percentage)}%</div>
            </article>
          );
        })}
      </section>

      <section className="card">
        <h2>Últimos gastos</h2>

        {loading && (
          <div className="skeleton-list">
            {[1, 2, 3].map((item) => (
              <div key={item} className="skeleton-item" />
            ))}
          </div>
        )}

        {!loading && expenses.length === 0 && (
          <p className="empty">Todavía no has registrado gastos este mes.</p>
        )}

        <div className="expense-list">
          {expenses.map((expense) => (
            <div className="expense-item" key={expense.id}>
              <div>
                <strong>{formatMoney(expense.amount)}</strong>
                <p>
                  {expense.categories?.name || "Sin categoría"} ·{" "}
                  {expense.description || "Sin descripción"} ·{" "}
                  {expense.expense_date}
                </p>
              </div>

              <button
                type="button"
                className="delete-button"
                onClick={() => deleteExpense(expense.id)}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Categorías y presupuestos</h2>

        <form onSubmit={addCategory} className="form">
          <label>
            Nueva categoría
            <input
              type="text"
              placeholder="Ej. Gasolina"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
            />
          </label>

          <label>
            Presupuesto mensual
            <div
              className="amount-display amount-display--sm"
              onClick={() => setKbBudgetOpen(true)}
            >
              <span className="amount-display__currency">$</span>
              <span className="amount-display__value">
                {newCategoryBudget ? (
                  Number(newCategoryBudget).toLocaleString("es-MX")
                ) : (
                  <span className="amount-display__placeholder">
                    Toca para ingresar
                  </span>
                )}
              </span>
              <span className="amount-display__icon">🔢</span>
            </div>
          </label>

          <button type="submit">Agregar categoría</button>
        </form>

        <div className="settings-list">
          {categories.map((category) => (
            <div className="settings-item" key={category.id}>
              <input
                type="text"
                defaultValue={category.name}
                onBlur={(event) =>
                  updateCategoryName(category.id, event.target.value)
                }
              />

              <input
                type="number"
                min="0"
                step="0.01"
                defaultValue={category.monthly_budget}
                inputMode="decimal"
                onBlur={(event) =>
                  updateCategoryBudget(category.id, event.target.value)
                }
              />

              <button
                type="button"
                className="delete-button"
                onClick={() => deleteCategory(category.id)}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="floating-ui">
        <div className={`share-menu ${actionsOpen ? "share-menu--open" : ""}`}>
          <button
            type="button"
            onClick={() => {
              copyWhatsAppSummary();
              setActionsOpen(false);
            }}
          >
            📋 Copiar resumen
          </button>

          <button
            type="button"
            onClick={() => {
              openWhatsAppSummary();
              setActionsOpen(false);
            }}
          >
            💬 Abrir WhatsApp
          </button>

          <button
            type="button"
            onClick={() => {
              sharePdfSummary();
              setActionsOpen(false);
            }}
          >
            📄 Compartir PDF
          </button>
        </div>

        <button
          type="button"
          className="share-fab"
          onClick={() => setActionsOpen(!actionsOpen)}
        >
          {actionsOpen ? "×" : "☰"}
        </button>

        <button
          type="button"
          className="add-fab"
          onClick={scrollToExpenseForm}
        >
          +
        </button>
      </div>
    </main>
  );
}